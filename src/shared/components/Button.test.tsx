import { fireEvent, render, screen } from '@testing-library/react-native'

import { Button } from '@/shared/components/Button'

describe('Button', () => {
  it('renders its label and calls onPress', async () => {
    const onPress = jest.fn()
    await render(<Button onPress={onPress}>Continuar</Button>)

    await fireEvent.press(screen.getByRole('button', { name: 'Continuar' }))

    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('hides the label and ignores presses while loading', async () => {
    const onPress = jest.fn()
    await render(
      <Button loading onPress={onPress}>
        Continuar
      </Button>,
    )

    expect(screen.queryByText('Continuar')).toBeNull()
    await fireEvent.press(screen.getByRole('button'))
    expect(onPress).not.toHaveBeenCalled()
  })

  it('ignores presses when disabled', async () => {
    const onPress = jest.fn()
    await render(
      <Button disabled onPress={onPress}>
        Continuar
      </Button>,
    )

    await fireEvent.press(screen.getByRole('button', { name: 'Continuar' }))
    expect(onPress).not.toHaveBeenCalled()
  })
})
