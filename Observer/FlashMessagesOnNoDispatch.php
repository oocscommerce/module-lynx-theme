<?php
/**
 * Copyright © OOCS Commerce (https://www.oocscommerce.com). All rights reserved.
 * See LICENSE.txt for license details.
 */
declare(strict_types=1);

namespace OOCS\LynxTheme\Observer;

use Magento\Framework\App\ActionFlag;
use Magento\Framework\App\ActionInterface;
use Magento\Framework\Controller\Result\RedirectFactory;
use Magento\Framework\Event\Observer;
use Magento\Framework\Event\ObserverInterface;
use Magento\Framework\Message\ManagerInterface;
use Magento\Theme\Controller\Result\MessagePlugin;

/**
 * Carries flash messages into the mage-messages cookie when a predispatch observer stopped the action
 */
class FlashMessagesOnNoDispatch implements ObserverInterface
{
    /**
     * Action flag, message manager, message plugin, redirect factory
     *
     * @param ActionFlag $actionFlag
     * @param ManagerInterface $messageManager
     * @param MessagePlugin $messagePlugin
     * @param RedirectFactory $redirectFactory
     */
    public function __construct(
        private readonly ActionFlag $actionFlag,
        private readonly ManagerInterface $messageManager,
        private readonly MessagePlugin $messagePlugin,
        private readonly RedirectFactory $redirectFactory,
    ) {
    }

    /**
     * Execute
     *
     * @param Observer $observer
     * @return void
     * @SuppressWarnings(PHPMD.UnusedFormalParameter)
     */
    public function execute(Observer $observer): void
    {
        if (!$this->actionFlag->get('', ActionInterface::FLAG_NO_DISPATCH)) {
            return;
        }
        if ($this->messageManager->getMessages()->getCount() === 0) {
            return;
        }

        $redirect = $this->redirectFactory->create();
        $this->messagePlugin->afterRenderResult($redirect, $redirect);
    }
}
